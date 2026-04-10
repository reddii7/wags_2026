<script setup>
import { computed } from "vue";

const props = defineProps({
  columns: {
    type: Array,
    default: () => [],
  },
  hideHead: {
    type: Boolean,
    default: false,
  },
  rows: {
    type: Array,
    default: () => [],
  },
  emptyText: {
    type: String,
    default: "No data available.",
  },
});

const columnTemplate = computed(() => {
  if (!props.columns.length) return "minmax(0, 1fr)";

  return props.columns
    .map((column) => {
      if (column.width) return column.width;

      const className = column.className || "";

      if (className.includes("player")) return "minmax(0, 1fr)";
      if (className.includes("numeric") && className.includes("narrow"))
        return "clamp(3.25rem, 12vw, 4.5rem)";
      if (className.includes("numeric")) return "clamp(4.5rem, 18vw, 7.5rem)";
      return "minmax(0, 1fr)";
    })
    .join(" ");
});
</script>

<template>
  <div
    class="quiet-list"
    role="table"
    :class="{ 'quiet-list--headless': hideHead }"
  >
    <div v-if="!hideHead" class="quiet-list-head" role="rowgroup">
      <div
        class="quiet-list-row quiet-list-row--head"
        role="row"
        :style="{ gridTemplateColumns: columnTemplate }"
      >
        <div
          v-for="column in columns"
          :key="column.key"
          class="quiet-list-cell"
          :class="column.className"
          role="columnheader"
        >
          {{ column.label }}
        </div>
      </div>
    </div>
    <div v-if="rows.length" class="quiet-list-body" role="rowgroup">
      <div
        v-for="row in rows"
        :key="row.id || row.key"
        class="quiet-list-row"
        role="row"
        :style="{ gridTemplateColumns: columnTemplate }"
      >
        <div
          v-for="column in columns"
          :key="column.key"
          class="quiet-list-cell"
          :class="column.className"
          role="cell"
        >
          <slot :name="column.key" :row="row">
            {{ row[column.key] }}
          </slot>
        </div>
      </div>
    </div>
    <p v-else class="empty-state">{{ emptyText }}</p>
  </div>
</template>
