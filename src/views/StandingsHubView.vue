<script setup>
import { markRaw } from "vue";
import HubShell from "../components/HubShell.vue";
import LeaguesView from "./LeaguesView.vue";
import Best14View from "./Best14View.vue";

defineProps({
  metadata: { type: Object, required: true },
});
const emit = defineEmits(["navigate"]);

const tabs = [
  { id: "leagues", label: "LEAGUES", component: markRaw(LeaguesView) },
  { id: "best14", label: "BEST 14", component: markRaw(Best14View) },
];
</script>

<template>
  <HubShell
    :metadata="metadata"
    :tabs="tabs"
    default-tab="leagues"
    base-path="/standings"
    @navigate="emit('navigate', $event)"
  />
</template>
