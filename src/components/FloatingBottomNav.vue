<script setup>
import { ref } from "vue";
import { RouterLink } from "vue-router";
import NavIcon from "./NavIcon.vue";

defineProps({
  items: {
    type: Array,
    default: () => [],
  },
  ariaLabel: {
    type: String,
    default: "Primary",
  },
});

const animatingItem = ref(null);

const triggerFeedback = (itemKey) => {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    navigator.vibrate(10);
  }

  animatingItem.value = itemKey;
  window.clearTimeout(triggerFeedback.timeoutId);
  triggerFeedback.timeoutId = window.setTimeout(() => {
    if (animatingItem.value === itemKey) {
      animatingItem.value = null;
    }
  }, 280);
};
</script>

<template>
  <nav class="floating-bottom-nav" :aria-label="ariaLabel">
    <RouterLink
      v-for="item in items"
      :key="item.to"
      :to="item.to"
      custom
      v-slot="{ href, navigate, isActive }"
    >
      <a
        :href="href"
        class="floating-bottom-nav__item"
        :class="{
          'floating-bottom-nav__item--active': isActive,
          'floating-bottom-nav__item--animating': animatingItem === item.to,
        }"
        :aria-label="item.label"
        @click="triggerFeedback(item.to); navigate($event)"
      >
        <NavIcon :name="item.icon" />
        <span class="floating-bottom-nav__sr">{{ item.label }}</span>
      </a>
    </RouterLink>
  </nav>
</template>

<style scoped>
.floating-bottom-nav {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: space-around;
  gap: 0;
  width: 100%;
  padding: 0.8rem 1.1rem calc(1rem + env(safe-area-inset-bottom, 20px));
  border-top: 0.5px solid rgba(255, 255, 255, 0.05);
  background: rgba(31, 31, 33, 0.96);
  backdrop-filter: blur(14px) saturate(115%);
  -webkit-backdrop-filter: blur(14px) saturate(115%);
  box-shadow: 0 -10px 30px rgba(0, 0, 0, 0.26);
  transition: opacity 220ms ease, transform 220ms ease;
}

.floating-bottom-nav__item {
  flex: 0 0 auto;
  min-width: 2.8rem;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.18rem;
  border-radius: 0;
  color: rgba(229, 229, 231, 0.38);
  text-decoration: none;
  transform: scale(1);
  transition: color 180ms ease, transform 180ms ease, opacity 180ms ease;
}

.floating-bottom-nav__item--active {
  color: var(--text);
}

.floating-bottom-nav__item--active :deep(.nav-icon) {
  stroke-width: 1.95;
}

.floating-bottom-nav__item--animating {
  animation: floating-dock-pop 260ms cubic-bezier(0.2, 0.85, 0.2, 1);
}

.floating-bottom-nav__item :deep(.nav-icon) {
  width: 1.72rem;
  height: 1.72rem;
}

.floating-bottom-nav__sr {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@keyframes floating-dock-pop {
  0% {
    transform: scale(1);
  }

  35% {
    transform: scale(0.9);
  }

  72% {
    transform: scale(1.05);
  }

  100% {
    transform: scale(1);
  }
}

:global(.app-shell.chrome-hidden) .floating-bottom-nav {
  opacity: 0;
  transform: translateY(14px);
  pointer-events: none;
}

:global(.app-shell[data-theme="dark"]) .floating-bottom-nav {
  background: rgba(31, 31, 33, 0.96);
  border-color: rgba(255, 255, 255, 0.05);
  box-shadow: 0 -10px 30px rgba(0, 0, 0, 0.26);
}

:global(.app-shell[data-theme="dark"]) .floating-bottom-nav__item {
  color: rgba(229, 229, 231, 0.38);
}

:global(.app-shell[data-theme="dark"]) .floating-bottom-nav__item--active {
  color: var(--text);
}

@media (max-width: 640px) {
  .floating-bottom-nav {
    padding: 0.74rem 0.7rem calc(0.92rem + env(safe-area-inset-bottom, 20px));
  }

  .floating-bottom-nav__item {
    min-width: 2.35rem;
    padding: 0.12rem;
  }

  .floating-bottom-nav__item :deep(.nav-icon) {
    width: 1.58rem;
    height: 1.58rem;
  }
}
</style>