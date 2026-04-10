<script setup>
import { computed } from "vue";

const props = defineProps({
  values: {
    type: Array,
    default: () => [],
  },
});

const pathData = computed(() => {
  const width = 360;
  const height = 112;
  const values = props.values
    .map(Number)
    .filter((value) => Number.isFinite(value));

  if (values.length < 2) {
    return null;
  }

  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = Math.max(max - min, 1);
  const step = width / Math.max(values.length - 1, 1);
  const points = values.map((value, index) => {
    const x = index * step;
    const y = height - (((value - min) / range) * (height - 20) + 10);
    return [x, y];
  });

  const line = points
    .map(
      ([x, y], index) =>
        `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`,
    )
    .join(" ");
  const fill = `${line} L ${width} ${height} L 0 ${height} Z`;
  return { width, height, line, fill };
});
</script>

<template>
  <div class="sparkline-shell">
    <svg
      v-if="pathData"
      :viewBox="`0 0 ${pathData.width} ${pathData.height}`"
      class="sparkline"
      role="img"
      aria-label="Best 14 trend"
    >
      <defs>
        <linearGradient id="quiet-gradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgba(58, 90, 64, 0.18)" />
          <stop offset="100%" stop-color="rgba(58, 90, 64, 0.01)" />
        </linearGradient>
      </defs>
      <path :d="pathData.fill" fill="url(#quiet-gradient)" />
      <path
        :d="pathData.line"
        fill="none"
        stroke="currentColor"
        stroke-width="1.2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
    <p v-else class="empty-state">
      Trend available once more rounds are recorded.
    </p>
  </div>
</template>
