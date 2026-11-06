<script setup>
const emit = defineEmits(["choose"]);

function choose(season) {
  emit("choose", season);
}
</script>

<template>
  <section class="season-landing">
    <div class="season-landing__mark" aria-hidden="true">
      <svg viewBox="0 0 64 48" class="season-landing__w">
        <path
          fill="currentColor"
          d="M4 6h10.2l7.6 22.2L29.2 6H35l7.4 22.2L50 6h10L46.6 42h-9.2l-7.2-20.4L23 42h-9.2z"
        />
        <circle cx="54.5" cy="8.5" r="3.1" fill="currentColor" />
      </svg>
    </div>

    <h1 class="season-landing__title">WAGS Golf Society.</h1>
    <p class="season-landing__prompt">Select a Season.</p>

    <div class="season-pick">
      <button type="button" class="season-card" @click="choose('summer')">
        <img
          src="/season-summer.jpg"
          alt=""
          class="season-card__photo"
        />
        <span class="season-card__caption">
          <span class="season-card__name">Summer Season</span>
          <span class="season-card__note">
            Main Season Standings, Results, &amp; Fixtures
          </span>
          <span class="season-card__chev" aria-hidden="true">›</span>
        </span>
      </button>

      <button type="button" class="season-card" @click="choose('winter')">
        <img
          src="/season-winter.jpg"
          alt=""
          class="season-card__photo"
        />
        <span class="season-card__caption">
          <span class="season-card__name">Winter Season</span>
          <span class="season-card__note">
            Winter League Results &amp; Leaderboards
          </span>
          <span class="season-card__chev" aria-hidden="true">›</span>
        </span>
      </button>
    </div>
  </section>
</template>

<style scoped>
.season-landing {
  display: flex;
  flex-direction: column;
  min-height: calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 1.5rem);
  color: #1c1c1c;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", sans-serif;
}

.season-landing__mark {
  display: flex;
  justify-content: center;
  color: #2f5d3a;
  margin: 0.15rem 0 0.85rem;
}

.season-landing__w {
  width: 3.35rem;
  height: auto;
}

.season-landing__title {
  margin: 0;
  max-width: 11ch;
  font-size: clamp(2.05rem, 8.4vw, 2.45rem);
  font-weight: 750;
  letter-spacing: -0.045em;
  line-height: 0.96;
  color: #1a1a1a;
}

.season-landing__prompt {
  margin: 0.55rem 0 0;
  font-size: 1.18rem;
  font-weight: 650;
  letter-spacing: -0.03em;
  line-height: 1.15;
  color: #2a2a2a;
}

.season-pick {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.7rem;
  margin-top: 1.05rem;
  flex: 1 1 auto;
  min-height: 0;
}

.season-card {
  position: relative;
  display: block;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 28px;
  overflow: hidden;
  min-height: 18.5rem;
  background: #d7d4cc;
  box-shadow: 0 10px 24px rgba(16, 16, 18, 0.08);
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
  object-position: center 42%;
}

.season-card__caption {
  position: absolute;
  left: 0.42rem;
  right: 0.42rem;
  bottom: 0.42rem;
  display: block;
  padding: 0.72rem 1.55rem 0.68rem 0.72rem;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 6px 16px rgba(16, 16, 18, 0.06);
}

.season-card__name {
  display: block;
  font-size: 1.28rem;
  font-weight: 750;
  letter-spacing: -0.04em;
  line-height: 1.02;
  color: #1a1a1a;
}

.season-card__note {
  display: block;
  margin-top: 0.28rem;
  font-size: 0.72rem;
  font-weight: 500;
  letter-spacing: -0.01em;
  line-height: 1.25;
  color: #3a3a3a;
}

.season-card__chev {
  position: absolute;
  right: 0.62rem;
  bottom: 0.62rem;
  font-size: 1.15rem;
  line-height: 1;
  color: #1a1a1a;
  font-weight: 500;
}
</style>
