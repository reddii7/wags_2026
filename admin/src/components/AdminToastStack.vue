<script setup>
import { useAdminToasts } from "@/composables/useAdminToasts.js";

const { toasts, removeToast } = useAdminToasts();
</script>

<template>
  <teleport to="body">
    <TransitionGroup name="toast" tag="div" class="toast-stack" aria-live="polite">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        :class="['toast', `tone-${toast.tone}`]"
        role="status"
      >
        <span>{{ toast.message }}</span>
        <button type="button" aria-label="Dismiss notification" @click="removeToast(toast.id)">
          ×
        </button>
      </div>
    </TransitionGroup>
  </teleport>
</template>

<style scoped>
.toast-stack {
  position: fixed;
  right: 1rem;
  bottom: 1rem;
  z-index: 1200;
  display: grid;
  gap: 0.6rem;
  width: min(28rem, calc(100vw - 2rem));
}

.toast {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.8rem;
  padding: 0.75rem 0.85rem 0.75rem 0.95rem;
  border: 1px solid color-mix(in srgb, var(--ok) 36%, var(--line));
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--ok) 12%, var(--panel));
  color: var(--text);
  box-shadow: var(--shadow);
  font-size: 0.88rem;
  font-weight: 650;
}

.toast.tone-warning {
  border-color: color-mix(in srgb, var(--warning) 42%, var(--line));
  background: color-mix(in srgb, var(--warning) 14%, var(--panel));
}

.toast.tone-danger,
.toast.tone-error {
  border-color: color-mix(in srgb, var(--danger) 42%, var(--line));
  background: color-mix(in srgb, var(--danger) 13%, var(--panel));
}

.toast button {
  flex-shrink: 0;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  font-size: 1.1rem;
  line-height: 1;
}

.toast button:hover {
  color: var(--text);
}

.toast-enter-active,
.toast-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
