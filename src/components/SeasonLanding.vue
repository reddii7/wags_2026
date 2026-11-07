<script setup>
import { onBeforeUnmount, onMounted, ref } from "vue";
import { useTheme } from "../composables/useTheme.js";
import { triggerHapticFeedback } from "../utils/haptics";

const emit = defineEmits(["choose"]);
const { theme, toggleTheme } = useTheme();

const videoId = "lo5ACwfOXI8";
const poster = `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
const frame = ref(null);
const playing = ref(false);
let player;

function mountPlayer() {
  if (!frame.value || !window.YT?.Player) return;
  player = new window.YT.Player(frame.value, {
    videoId,
    playerVars: {
      autoplay: 1,
      mute: 1,
      controls: 0,
      rel: 0,
      modestbranding: 1,
      playsinline: 1,
      loop: 1,
      playlist: videoId,
      disablekb: 1,
      fs: 0,
      iv_load_policy: 3,
      start: 8,
    },
    events: {
      onReady(event) {
        event.target.mute();
        event.target.playVideo();
      },
      onStateChange(event) {
        if (event.data === window.YT.PlayerState.PLAYING) playing.value = true;
      },
    },
  });
}

onMounted(() => {
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
        <div ref="frame" />
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
  left: 50%;
  top: 0;
  width: 190%;
  height: 190%;
  object-fit: cover;
  object-position: center 12%;
  transform: translateX(-50%);
}

.welcome__player {
  opacity: 0;
  transition: opacity 500ms ease;
}

.welcome__video.is-on .welcome__player {
  opacity: 1;
}

.welcome__player :deep(iframe) {
  position: absolute !important;
  top: 50% !important;
  left: 50% !important;
  width: 178vh !important;
  height: 100vh !important;
  min-width: 100% !important;
  min-height: 56.25vw !important;
  border: 0;
  transform: translate(-50%, -50%) scale(1.45);
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

.welcome__badge {
  margin: 1.7rem 0 0;
  padding: 0.38rem 0.75rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.16);
  font-size: 0.68rem;
  font-weight: 650;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
}

.welcome__content h1 {
  margin: 1.05rem 0 0;
  max-width: 18rem;
  font-family: var(--font-serif);
  font-size: clamp(2.15rem, 8vw, 2.65rem);
  font-weight: 650;
  letter-spacing: -0.035em;
  line-height: 1.05;
  text-shadow: 0 2px 16px rgba(0, 0, 0, 0.35);
}

.welcome__content h1 em {
  font-family: Georgia, "Iowan Old Style", Palatino, serif;
  font-style: italic;
  font-weight: 500;
  color: #e6c27a;
}

.welcome__lead {
  margin: 0.9rem 0 0;
  max-width: 22rem;
  color: rgba(255, 255, 255, 0.92);
  font-size: 1rem;
  line-height: 1.4;
  text-shadow: 0 1px 10px rgba(0, 0, 0, 0.45);
}

.welcome__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
  margin-top: 1.25rem;
}

.pill {
  margin: 0;
  padding: 0.72rem 1.05rem;
  border: 0;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.94);
  color: #1c1c1e;
  font: inherit;
  font-size: 0.98rem;
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
