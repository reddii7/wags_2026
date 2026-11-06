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
    <header class="season-landing__bar">
      <span class="season-landing__mark" aria-hidden="true">
        <span class="season-landing__w">W</span>
        <span class="season-landing__ball"></span>
      </span>
      <button
        type="button"
        class="theme-switch season-landing__theme"
        :aria-label="theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'"
        @click="onToggleTheme"
      >
        {{ theme === "dark" ? "Light" : "Dark" }}
      </button>
    </header>

    <h1 class="season-landing__title">WAGS Golf<br />Society.</h1>
    <p class="season-landing__prompt">Select a season.</p>

    <div class="season-pick">
      <button type="button" class="season-card" @click="choose('summer')">
        <img src="/season-summer.jpg" alt="" class="season-card__photo" />
        <span class="season-card__caption">
          <span class="season-card__copy">
            <span class="season-card__name"><span>Summer</span> Season</span>
            <span class="season-card__note">
              Main Season Standings, Results, &amp; Fixtures
            </span>
          </span>
          <span class="season-card__chev" aria-hidden="true">›</span>
        </span>
      </button>

      <button type="button" class="season-card" @click="choose('winter')">
        <img src="/season-winter.jpg" alt="" class="season-card__photo" />
        <span class="season-card__caption">
          <span class="season-card__copy">
            <span class="season-card__name"><span>Winter</span> Season</span>
            <span class="season-card__note">
              Winter League Results &amp; Leaderboards
            </span>
          </span>
          <span class="season-card__chev" aria-hidden="true">›</span>
        </span>
      </button>
    </div>
  </section>
</template>

<style scoped>
.season-landing {
  color: var(--text);
  font-family: var(--font-sans);
}

.season-landing__bar {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 2.4rem;
  margin-bottom: 0.85rem;
  color: var(--accent);
}

.season-landing__theme {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  z-index: 1;
}

.season-landing__mark {
  position: relative;
  width: 2.35rem;
  height: 2.2rem;
}

.season-landing__w {
  font-family: var(--font-serif);
  font-size: 2.15rem;
  font-weight: 650;
  line-height: 1;
  letter-spacing: -0.04em;
  color: var(--accent);
}

.season-landing__ball {
  position: absolute;
  top: 0.08rem;
  right: -0.05rem;
  width: 0.38rem;
  height: 0.38rem;
  border-radius: 50%;
  background: var(--accent);
}

.season-landing__title {
  margin: 0;
  font-family: var(--font-serif);
  font-size: clamp(1.7rem, 4.6vw, 2.05rem);
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1.05;
  color: var(--text);
}

.season-landing__prompt {
  margin: 0.4rem 0 0;
  font-size: 0.95rem;
  font-weight: 650;
  letter-spacing: -0.01em;
  line-height: 1.2;
  color: var(--accent);
}

.season-pick {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.72rem;
  margin-top: 1.05rem;
}

.season-card {
  position: relative;
  display: block;
  height: min(58dvh, 34rem);
  min-height: 23rem;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 28px;
  overflow: hidden;
  background: #d7d4cc;
  box-shadow: 0 8px 18px rgba(16, 16, 18, 0.06);
  cursor: pointer;
  text-align: left;
  -webkit-tap-highlight-color: transparent;
}

.season-card:active {
  transform: scale(0.985);
}

.season-card__photo {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center 40%;
}

.season-card__caption {
  position: absolute;
  left: 0.4rem;
  right: 0.4rem;
  bottom: 0.4rem;
  display: flex;
  align-items: flex-end;
  gap: 0.25rem;
  padding: 0.62rem 0.55rem 0.58rem 0.68rem;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.96);
}

.season-card__copy {
  min-width: 0;
  flex: 1 1 auto;
}

.season-card__name {
  display: block;
  font-size: 1.15rem;
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1.05;
  color: #1a1a1a;
}

.season-card__name span {
  color: #2f5d3a;
}

.season-card__note {
  display: block;
  margin-top: 0.22rem;
  font-size: 0.68rem;
  font-weight: 500;
  letter-spacing: -0.01em;
  line-height: 1.25;
  color: #4a4a4a;
}

.season-card__chev {
  flex: 0 0 auto;
  font-size: 1.15rem;
  line-height: 1;
  color: #1a1a1a;
  padding-bottom: 0.05rem;
}

:global([data-theme="dark"] .season-card__name span) {
  color: #3dd68c;
}
</style>
