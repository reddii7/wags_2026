<script setup>
import { onBeforeUnmount, onMounted, ref } from "vue";
import { useTheme } from "../composables/useTheme.js";
import { triggerHapticFeedback } from "../utils/haptics";

const emit = defineEmits(["choose"]);
const { theme, toggleTheme } = useTheme();

const videoId = "md_CSMNegXI";
const poster = `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
const videoSrc =
  `https://www.youtube-nocookie.com/embed/${videoId}` +
  "?autoplay=1&mute=1&controls=0&playsinline=1&loop=1" +
  `&playlist=${videoId}&rel=0&modestbranding=1&enablejsapi=1` +
  `&disablekb=1&fs=0&iv_load_policy=3&origin=${encodeURIComponent(window.location.origin)}`;
const frame = ref(null);
const playing = ref(false);
let player;
let retries = [];

function kick() {
  if (!player?.playVideo) return;
  try {
    player.mute();
    player.playVideo();
  } catch {
    /* the player can reject a start before it is ready */
  }
}

function onGesture() {
  kick();
}

function mountPlayer() {
  if (!frame.value || !window.YT?.Player || player) return;
  player = new window.YT.Player(frame.value, {
    events: {
      onReady(event) {
        event.target.mute();
        event.target.playVideo();
        retries.forEach(clearTimeout);
        retries = [400, 1200, 2500].map((ms) => setTimeout(kick, ms));
      },
      onStateChange(event) {
        const state = window.YT.PlayerState;
        if (event.data === state.PLAYING) playing.value = true;
        if (event.data === state.CUED) kick();
      },
    },
  });
}

onMounted(() => {
  window.addEventListener("pointerdown", onGesture, true);
  window.addEventListener("touchstart", onGesture, { capture: true, passive: true });
  document.addEventListener("visibilitychange", onGesture);
  if (window.YT?.Player) {
    mountPlayer();
    return;
  }
  const previous = window.onYouTubeIframeAPIReady;
  window.onYouTubeIframeAPIReady = () => {
    previous?.();
    mountPlayer();
  };
  if (!document.querySelector("script[data-youtube-iframe]")) {
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    tag.dataset.youtubeIframe = "true";
    document.head.appendChild(tag);
  }
});

onBeforeUnmount(() => {
  retries.forEach(clearTimeout);
  window.removeEventListener("pointerdown", onGesture, true);
  window.removeEventListener("touchstart", onGesture, { capture: true });
  document.removeEventListener("visibilitychange", onGesture);
  player?.destroy?.();
});

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
    <div class="welcome__video" :class="{ 'is-on': playing }" aria-hidden="true">
      <img class="welcome__poster" :src="poster" alt="" />
      <div class="welcome__player">
        <iframe
          ref="frame"
          :src="videoSrc"
          title="Background film"
          allow="autoplay; encrypted-media; picture-in-picture"
          referrerpolicy="strict-origin-when-cross-origin"
          playsinline
        />
      </div>
    </div>
    <div class="welcome__shade" aria-hidden="true" />

    <div class="welcome__content">
      <header class="welcome__top">
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
        <p class="welcome__badge">Sutton WAGS</p>
        <h1>Two seasons. The <em>best</em> golf, close to home.</h1>
        <p class="welcome__lead">
          Summer is the main season, with results and standings. Winter is the shorter game: this week and Best 10.
        </p>
        <div class="welcome__actions">
          <button type="button" class="pill" @click="choose('summer')">Summer</button>
          <button type="button" class="pill pill--gold" @click="choose('winter')">Winter</button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.welcome {
  position: relative;
  min-height: 100dvh;
  height: 100%;
  overflow: hidden;
  background: #0c1210;
  color: #ffffff;
}

.welcome__video,
.welcome__player {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

.welcome__poster {
  position: absolute;
  z-index: 1;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center center;
  transition: opacity 400ms ease;
}

.welcome__player {
  z-index: 0;
  opacity: 1;
}

.welcome__video.is-on .welcome__poster {
  opacity: 0;
}

.welcome__player :deep(iframe) {
  position: absolute !important;
  top: 50% !important;
  left: 50% !important;
  width: max(100vw, 56.25vh) !important;
  height: max(100vh, 177.78vw) !important;
  border: 0;
  transform: translate(-50%, -50%) scale(1.08);
}

.welcome__shade {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(180deg, rgba(0, 0, 0, 0.55) 0%, rgba(0, 0, 0, 0.12) 32%, rgba(0, 0, 0, 0.08) 52%, rgba(0, 0, 0, 0.45) 100%);
  pointer-events: none;
}

.welcome__content {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  min-height: 100dvh;
  padding:
    calc(env(safe-area-inset-top, 0px) + 0.7rem)
    1.35rem
    calc(env(safe-area-inset-bottom, 0px) + 1.8rem);
}

.welcome__top {
  align-self: flex-end;
}

.welcome__theme {
  margin: 0;
  padding: 0.45rem 0.85rem;
  border: 0;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.18);
  color: #ffffff;
  font: inherit;
  font-size: 0.92rem;
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.welcome__copy {
  margin-top: 11vh;
}

.welcome__badge {
  display: inline-flex;
  width: fit-content;
  margin: 0;
  padding: 0.42rem 0.8rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.18);
  font-size: 0.72rem;
  font-weight: 650;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
}

.welcome__content h1 {
  margin: 1.15rem 0 0;
  max-width: 16.2rem;
  font-family: var(--font-serif);
  font-size: clamp(2.35rem, 9vw, 2.85rem);
  font-weight: 650;
  letter-spacing: -0.04em;
  line-height: 1.02;
  text-shadow: 0 2px 16px rgba(0, 0, 0, 0.4);
}

.welcome__content h1 em {
  font-family: Georgia, "Iowan Old Style", Palatino, serif;
  font-style: italic;
  font-weight: 500;
  color: #e6c27a;
}

.welcome__lead {
  margin: 0.95rem 0 0;
  max-width: 19.5rem;
  color: rgba(255, 255, 255, 0.92);
  font-size: 1.02rem;
  line-height: 1.38;
  text-shadow: 0 1px 10px rgba(0, 0, 0, 0.5);
}

.welcome__actions {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.7rem;
  margin-top: 1.35rem;
}

.pill {
  margin: 0;
  padding: 0.78rem 1.15rem;
  border: 0;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.94);
  color: #1c1c1e;
  font: inherit;
  font-size: 1rem;
  font-weight: 650;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.pill--gold {
  background: #c6a15a;
  color: #ffffff;
}

.pill:active {
  opacity: 0.78;
}
</style>
