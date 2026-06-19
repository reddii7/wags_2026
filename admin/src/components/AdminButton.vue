<script setup>
import { computed } from "vue";

defineOptions({ inheritAttrs: false });

const props = defineProps({
  type: { type: String, default: "button" },
  variant: { type: String, default: "secondary" },
  size: { type: String, default: "default" },
  pill: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
});

const classes = computed(() => [
  "admin-button",
  `variant-${props.variant}`,
  `size-${props.size}`,
  { pill: props.pill },
]);
</script>

<template>
  <button
    v-bind="$attrs"
    :type="type"
    :disabled="disabled"
    :class="classes"
  >
    <slot />
  </button>
</template>

<style scoped>
.admin-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  padding: 0.52rem 0.95rem;
  background: var(--panel);
  color: var(--text);
  font: inherit;
  font-size: 0.85rem;
  font-weight: 750;
  line-height: 1.2;
  cursor: pointer;
  text-decoration: none;
  transition:
    border-color 0.16s ease,
    background 0.16s ease,
    transform 0.16s ease;
}

.admin-button.pill {
  border-radius: 999px;
}

.admin-button.size-compact {
  padding: 0.42rem 0.75rem;
  font-size: 0.8rem;
}

.admin-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.admin-button:not(:disabled):hover {
  border-color: var(--line-strong);
  background: var(--panel-strong);
  transform: translateY(-1px);
}

.variant-primary {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--accent-contrast);
}

.variant-primary:not(:disabled):hover {
  border-color: var(--accent-hover);
  background: var(--accent-hover);
}

.variant-danger {
  border-color: color-mix(in srgb, var(--danger) 58%, var(--line));
  color: var(--danger);
}

.variant-danger-solid {
  border-color: var(--danger);
  background: var(--danger);
  color: #fff;
}

.variant-danger-solid:not(:disabled):hover {
  border-color: color-mix(in srgb, var(--danger) 86%, #000);
  background: color-mix(in srgb, var(--danger) 86%, #000);
}

.variant-ghost {
  background: transparent;
}
</style>
