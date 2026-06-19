<script setup>
import { ref } from "vue";
import { useAdminOverlayFocus } from "@/composables/useAdminOverlayFocus.js";

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, required: true },
  kicker: { type: String, default: "" },
  subtitle: { type: String, default: "" },
});

const emit = defineEmits(["close"]);
const sheet = ref(null);
const closeButton = ref(null);

useAdminOverlayFocus({
  isOpen: () => props.open,
  containerRef: sheet,
  initialFocusRef: closeButton,
  onEscape: () => emit("close"),
});
</script>

<template>
  <teleport to="body">
    <div v-if="open" class="sheet-backdrop" @click.self="emit('close')">
      <section
        ref="sheet"
        class="admin-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-sheet-title"
        tabindex="-1"
      >
        <header class="sheet-head">
          <div>
            <p v-if="kicker" class="sheet-kicker">{{ kicker }}</p>
            <h2 id="admin-sheet-title">{{ title }}</h2>
            <p v-if="subtitle" class="sheet-sub">{{ subtitle }}</p>
          </div>
          <button ref="closeButton" type="button" class="icon-x" aria-label="Close" @click="emit('close')">
            ×
          </button>
        </header>

        <div class="sheet-body">
          <slot />
        </div>

        <footer v-if="$slots.footer" class="sheet-foot">
          <slot name="footer" />
        </footer>
      </section>
    </div>
  </teleport>
</template>

<style scoped>
.sheet-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: stretch;
  justify-content: flex-end;
  padding: 0;
  background: rgba(0, 0, 0, 0.58);
  backdrop-filter: blur(8px);
  animation: sheet-backdrop-in 0.18s ease;
}

.admin-sheet {
  display: flex;
  flex-direction: column;
  width: min(620px, 100vw);
  min-height: 100vh;
  border-left: 1px solid var(--line);
  background: var(--panel);
  box-shadow: var(--shadow);
  animation: sheet-in 0.22s ease;
}

.sheet-head {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem 1.1rem;
  border-bottom: 1px solid var(--line);
  background: color-mix(in srgb, var(--panel-strong) 86%, var(--panel));
}

.sheet-head h2 {
  margin: 0;
  font-size: 1.12rem;
  letter-spacing: -0.02em;
}

.sheet-kicker {
  margin: 0 0 0.2rem;
  color: var(--accent);
  font-size: 0.68rem;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.sheet-sub {
  margin: 0.2rem 0 0;
  color: var(--muted);
  font-size: 0.8rem;
}

.icon-x {
  border: 0;
  background: none;
  color: var(--muted);
  cursor: pointer;
  font-size: 1.5rem;
  line-height: 1;
}

.icon-x:hover {
  color: var(--text);
}

.sheet-body {
  flex: 1;
  padding: 1rem 1.1rem 1.5rem;
  overflow-y: auto;
}

.sheet-foot {
  position: sticky;
  bottom: 0;
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  padding: 0.9rem 1.1rem;
  border-top: 1px solid var(--line);
  background: color-mix(in srgb, var(--panel-strong) 86%, var(--panel));
}

@keyframes sheet-backdrop-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes sheet-in {
  from {
    opacity: 0;
    transform: translateX(1.5rem);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@media (max-width: 640px) {
  .admin-sheet {
    width: 100vw;
  }
}
</style>
