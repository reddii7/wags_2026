<script setup>
defineProps({
  tone: { type: String, default: "default" },
});
</script>

<template>
  <div :class="['admin-notice', `tone-${tone}`]">
    <slot />
  </div>
</template>

<style scoped>
.admin-notice {
  margin: 0;
  padding: 0.8rem 1rem;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--panel);
  color: var(--muted-strong);
  font-size: 0.88rem;
  line-height: 1.45;
}

.tone-warning {
  border-color: color-mix(in srgb, var(--warning) 36%, var(--line));
  background: var(--warning-soft);
  color: var(--warning);
}

.tone-error,
.tone-danger {
  border-color: color-mix(in srgb, var(--danger) 36%, var(--line));
  background: var(--danger-soft);
  color: var(--danger);
}

.tone-success,
.tone-ok {
  border-color: color-mix(in srgb, var(--ok) 36%, var(--line));
  background: var(--ok-soft);
  color: var(--ok);
}
</style>
