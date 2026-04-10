<script setup>
import { computed } from "vue";

const props = defineProps({
  name: {
    type: String,
    required: true,
  },
});

const iconPaths = {
  home: ["M3.75 9.75 12 3l8.25 6.75", "M5.25 8.625V21h13.5V8.625"],
  results: [
    "M6.75 6.75h10.5",
    "M6.75 12h10.5",
    "M6.75 17.25h6.75",
    "M4.5 3.75h15A1.5 1.5 0 0 1 21 5.25v13.5A1.5 1.5 0 0 1 19.5 20.25h-15A1.5 1.5 0 0 1 3 18.75V5.25A1.5 1.5 0 0 1 4.5 3.75Z",
  ],
  best14: [
    "M12 3.75 14.548 8.914 20.25 9.742 16.125 13.763 17.099 19.44 12 16.759 6.901 19.44 7.875 13.763 3.75 9.742 9.452 8.914 12 3.75Z",
  ],
  handicaps: [
    "M12 12.75a4.125 4.125 0 1 0 0-8.25 4.125 4.125 0 0 0 0 8.25Z",
    "M4.5 20.25a7.5 7.5 0 0 1 15 0",
  ],
  leagues: [
    "M6.75 18.75V10.5",
    "M12 18.75V5.25",
    "M17.25 18.75v-6",
    "M5.25 18.75h13.5",
  ],
  admin: [
    "M12 3.75 18.75 7.5v9L12 20.25 5.25 16.5v-9L12 3.75Z",
    "M9.75 12 11.25 13.5 14.25 10.5",
  ],
  scores: [
    "M5.25 5.25h13.5",
    "M5.25 12h13.5",
    "M5.25 18.75h8.25",
    "M17.25 16.5 18.75 18 20.25 15.75",
  ],
  users: [
    "M9 10.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
    "M15.75 11.25a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5Z",
    "M3.75 19.5a5.25 5.25 0 0 1 10.5 0",
    "M13.5 19.5a4.5 4.5 0 0 1 6.75-3.885",
  ],
};

const paths = computed(() => iconPaths[props.name] || iconPaths.home);
</script>

<template>
  <svg
    class="nav-icon"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path
      v-for="path in paths"
      :key="path"
      :d="path"
      stroke="currentColor"
      stroke-width="1.95"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
</template>
