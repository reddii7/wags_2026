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
        {{ theme === "dark" ? "Light Mode" : "Dark Mode" }}
      </button>
      <button v-if="!isAdminRoute" class="topbar-menu-item" @click="onAdmin">
        Admin
      </button>
      <button v-if="isAdminRoute" class="topbar-menu-item" @click="onPublic">
        Public
      </button>
      <button v-if="isAdminRoute" class="topbar-menu-item" @click="onSignOut">
        Sign out
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from "vue";
import { useTheme } from "../composables/useTheme";
import { useSession } from "../composables/useSession";
import { useRoute, useRouter } from "vue-router";

const emit = defineEmits(["theme-toggle", "admin", "public", "signout"]);
const { theme, toggleTheme } = useTheme();
const { user, signOut } = useSession();
const route = useRoute();
const router = useRouter();

const open = ref(false);
const isAdminRoute = computed(() => route.path.startsWith("/admin"));

function toggleMenu(e) {
  e.stopPropagation();
  open.value = !open.value;
}
function closeMenu() {
  open.value = false;
}
function onThemeToggle() {
  toggleTheme();
  closeMenu();
}
function onAdmin() {
  closeMenu();
  router.push("/admin/login");
}
function onPublic() {
  closeMenu();
  router.push("/");
}
async function onSignOut() {
  await signOut();
  closeMenu();
  router.push("/");
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
