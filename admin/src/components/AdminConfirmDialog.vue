<script setup>
import { computed, ref } from "vue";
import { useAdminOverlayFocus } from "@/composables/useAdminOverlayFocus.js";

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: "" },
  message: { type: String, default: "" },
  detail: { type: String, default: "" },
  confirmLabel: { type: String, default: "Continue" },
  cancelLabel: { type: String, default: "Cancel" },
  tone: { type: String, default: "default" },
  icon: { type: String, default: "" },
});

const emit = defineEmits(["confirm", "cancel"]);
const dialogCard = ref(null);
const cancelButton = ref(null);

const dialogIcon = computed(() => {
  if (props.icon) return props.icon;
  if (props.tone === "danger") return "!";
  if (props.tone === "success") return "✓";
  return "?";
});

useAdminOverlayFocus({
  isOpen: () => props.open,
  containerRef: dialogCard,
  initialFocusRef: cancelButton,
  onEscape: () => emit("cancel"),
});
</script>

<template>
  <teleport to="body">
    <div v-if="open" class="confirm-backdrop" @click.self="emit('cancel')">
      <div
        ref="dialogCard"
        class="confirm-card"
        :class="`tone-${tone}`"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="admin-confirm-title"
        aria-describedby="admin-confirm-message"
        tabindex="-1"
      >
        <div class="confirm-icon" aria-hidden="true">{{ dialogIcon }}</div>
        <div class="confirm-content">
          <h2 id="admin-confirm-title">{{ title }}</h2>
          <p id="admin-confirm-message">{{ message }}</p>
          <p v-if="detail" class="confirm-detail">{{ detail }}</p>
        </div>
        <div class="confirm-actions">
          <button
            ref="cancelButton"
            type="button"
            class="confirm-button secondary"
            @click="emit('cancel')"
          >
            {{ cancelLabel }}
          </button>
          <button
            type="button"
            :class="['confirm-button', tone === 'danger' ? 'danger' : 'primary']"
            @click="emit('confirm')"
          >
            {{ confirmLabel }}
          </button>
        </div>
      </div>
    </div>
  </teleport>
</template>

<style scoped>
.confirm-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgba(0, 0, 0, 0.58);
  backdrop-filter: blur(8px);
}

.confirm-card {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.9rem;
  width: min(520px, 100%);
  padding: 1rem;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: var(--panel);
  box-shadow: var(--shadow);
}

.confirm-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 16%, var(--panel));
  color: var(--accent);
  font-weight: 900;
}

.tone-danger .confirm-icon {
  background: var(--danger-soft);
  color: var(--danger);
}

.tone-success .confirm-icon {
  background: var(--ok-soft);
  color: var(--ok);
}

.confirm-content h2 {
  margin: 0 0 0.35rem;
  font-size: 1rem;
  letter-spacing: -0.01em;
}

.confirm-content p {
  margin: 0;
  color: var(--muted-strong);
  font-size: 0.88rem;
  line-height: 1.45;
}

.confirm-detail {
  margin-top: 0.75rem !important;
  padding: 0.7rem 0.8rem;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--panel-strong) 70%, transparent);
  color: var(--text) !important;
  white-space: pre-line;
}

.confirm-actions {
  grid-column: 1 / -1;
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  padding-top: 0.2rem;
}

.confirm-button {
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  padding: 0.52rem 0.95rem;
  background: var(--panel);
  color: var(--text);
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
  transition:
    border-color 0.16s ease,
    background 0.16s ease,
    transform 0.16s ease;
}

.confirm-button:not(:disabled):hover {
  border-color: var(--line-strong);
  background: var(--panel-strong);
  transform: translateY(-1px);
}

.confirm-button.primary {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--accent-contrast);
}

.confirm-button.primary:not(:disabled):hover {
  border-color: var(--accent-hover);
  background: var(--accent-hover);
}

.confirm-button.danger {
  border-color: var(--danger);
  background: var(--danger);
  color: #fff;
}

.confirm-button.danger:not(:disabled):hover {
  border-color: color-mix(in srgb, var(--danger) 86%, #000);
  background: color-mix(in srgb, var(--danger) 86%, #000);
}
</style>
