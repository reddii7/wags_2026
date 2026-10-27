<script setup>
import { markRaw } from "vue";
import HubShell from "../components/HubShell.vue";
import SeasonHonourPanel from "./SeasonHonourPanel.vue";
import WinnersTable from "./WinnersTable.vue";

defineProps({
  metadata: { type: Object, required: true },
});
const emit = defineEmits(["navigate"]);

const tabs = [
  { id: "history", label: "HONOUR", component: markRaw(SeasonHonourPanel) },
  { id: "champs", label: "CHAMPS", component: markRaw(WinnersTable) },
];
</script>

<template>
  <HubShell
    :metadata="metadata"
    :tabs="tabs"
    default-tab="history"
    base-path="/season"
    @navigate="emit('navigate', $event)"
  />
</template>
