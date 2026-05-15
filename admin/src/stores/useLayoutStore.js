import { defineStore } from "pinia";

const SIDEBAR_KEY = "wags_admin_sidebar_collapsed";
const CONNECT_KEY = "wags_admin_connect_collapsed";

export const useLayoutStore = defineStore("layout", {
  state: () => ({
    sidebarCollapsed: localStorage.getItem(SIDEBAR_KEY) === "true",
    connectCollapsed: localStorage.getItem(CONNECT_KEY) !== "false",
    mobileDrawerOpen: false,
  }),

  actions: {
    toggleSidebar() {
      this.sidebarCollapsed = !this.sidebarCollapsed;
      localStorage.setItem(SIDEBAR_KEY, String(this.sidebarCollapsed));
    },

    setSidebarCollapsed(value) {
      this.sidebarCollapsed = value;
      localStorage.setItem(SIDEBAR_KEY, String(value));
    },

    openMobileDrawer() {
      this.mobileDrawerOpen = true;
    },

    closeMobileDrawer() {
      this.mobileDrawerOpen = false;
    },

    toggleConnectPanel() {
      this.connectCollapsed = !this.connectCollapsed;
      localStorage.setItem(CONNECT_KEY, String(this.connectCollapsed));
    },
  },
});
