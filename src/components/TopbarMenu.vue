<template>
  <div class="topbar-menu-wrapper" @click.outside="closeMenu">
    <button class="topbar-menu-btn" @click="toggleMenu" aria-label="Menu">
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle cx="5" cy="12" r="2" fill="currentColor" />
        <circle cx="12" cy="12" r="2" fill="currentColor" />
        <circle cx="19" cy="12" r="2" fill="currentColor" />
      </svg>
    </button>
    <div v-if="open" class="topbar-menu-dropdown">
      <button class="topbar-menu-item" @click="onThemeToggle">
        Toggle Theme
      </button>
      <button v-if="showNotifOption" class="topbar-menu-item" @click="onEnableNotifications">
        {{ notifLabel }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from "vue";
import { useTheme } from "../composables/useTheme";

const { toggleTheme } = useTheme();

const emit = defineEmits(["enable-notifications"]);

const open = ref(false);

// Only show if running as installed PWA and push is supported
const isStandalone =
  window.matchMedia("(display-mode: standalone)").matches ||
  window.navigator.standalone === true;
const pushSupported = "PushManager" in window && isStandalone;

const showNotifOption = computed(() => pushSupported);
const notifLabel = computed(() => {
  if (Notification.permission === "granted") return "Notifications on ✓";
  if (Notification.permission === "denied") return "Notifications blocked";
  return "Enable Notifications";
});

function toggleMenu(e) {
  e.stopPropagation();
  open.value = !open.value;
}
function onThemeToggle() {
  toggleTheme();
  open.value = false;
}
function onEnableNotifications() {
  localStorage.removeItem("wags-push-dismissed");
  localStorage.removeItem("wags-push-accepted");
  emit("enable-notifications");
  open.value = false;
}
function closeMenu() {
  open.value = false;
}
</script>

<style scoped>
.topbar-menu-wrapper {
  position: relative;
  display: inline-block;
}
.topbar-menu-btn {
  background: none;
  border: none;
  padding: 0.5rem;
  border-radius: 50%;
  cursor: pointer;
  color: inherit;
  transition: background 0.15s;
}
.topbar-menu-btn:active {
  background: rgba(0, 0, 0, 0.08);
}
.topbar-menu-dropdown {
  position: absolute;
  right: 0;
  top: 2.2rem;
  min-width: 140px;
  background: var(--dropdown-bg, #232325);
  color: var(--dropdown-fg, #fff);
  border-radius: 12px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.18);
  z-index: 100;
  padding: 0.5rem 0;
  display: flex;
  flex-direction: column;
}
.topbar-menu-item {
  background: none;
  border: none;
  color: inherit;
  text-align: left;
  padding: 0.7rem 1.2rem;
  font-size: 1rem;
  cursor: pointer;
  transition: background 0.13s;
}
.topbar-menu-item:hover {
  background: rgba(255, 255, 255, 0.07);
}
</style>
