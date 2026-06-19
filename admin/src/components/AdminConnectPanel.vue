<script setup>
import { inject } from "vue";
import { useLayoutStore } from "@/stores/useLayoutStore.js";

const admin = inject("adminCtx");
const layout = useLayoutStore();
</script>

<template>
  <section v-if="admin" class="connect" aria-label="Supabase connection">
    <button
      type="button"
      class="connect-toggle"
      :aria-expanded="!layout.connectCollapsed"
      @click="layout.toggleConnectPanel()"
    >
      <span
        class="status-dot"
        :data-on="admin.connected.value"
        aria-hidden="true"
      />
      <span class="connect-toggle-label">
        {{ admin.connected.value ? "Connected" : "Offline" }}
        — {{ layout.connectCollapsed ? "Show connection" : "Hide connection" }}
      </span>
      <span class="chevron" aria-hidden="true">{{ layout.connectCollapsed ? "▾" : "▴" }}</span>
    </button>

    <div v-show="!layout.connectCollapsed" class="connect-body">
      <p class="connect-lede">
        Admin needs the <strong>service_role</strong> key (Dashboard → Settings → API), not the
        member app anon key. Put both in <code>admin/.env</code> as
        <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_SERVICE_ROLE_KEY</code> — that overrides
        old saved URLs in <code>localStorage</code>.
      </p>
      <div class="connect-grid">
        <label class="field">
          <span class="label">Project URL</span>
          <input
            v-model="admin.url.value"
            class="input"
            type="url"
            autocomplete="off"
            placeholder="https://iwzqzpzskawxrwhttufq.supabase.co"
          />
        </label>
        <label class="field">
          <span class="label">Service role key</span>
          <input
            v-model="admin.key.value"
            class="input"
            type="password"
            autocomplete="off"
            placeholder="eyJ…"
          />
        </label>
      </div>
      <div class="row">
        <button
          type="button"
          class="btn primary"
          :disabled="admin.connecting.value || !admin.url.value.trim() || !admin.key.value.trim()"
          @click="admin.connect"
        >
          {{ admin.connecting.value ? "Connecting…" : "Connect" }}
        </button>
        <button
          v-if="admin.connected.value"
          type="button"
          class="btn ghost"
          @click="admin.disconnect"
        >
          Disconnect
        </button>
      </div>
      <p v-if="admin.connectError.value" class="msg err">{{ admin.connectError.value }}</p>
      <p v-else-if="admin.connected.value && admin.lastProbeOk.value" class="msg ok">
        Reachability OK (live WAGS schema).
      </p>
    </div>
  </section>
</template>

<style scoped>
.connect {
  border-bottom: 1px solid var(--line);
  background: color-mix(in srgb, var(--surface) 82%, transparent);
  backdrop-filter: blur(16px);
}

.connect-toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.55rem clamp(0.85rem, 2vw, 1.25rem);
  border: none;
  background: transparent;
  color: var(--text);
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  text-align: left;
}

.connect-toggle:hover {
  background: color-mix(in srgb, var(--accent) 7%, transparent);
}

.status-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 999px;
  background: var(--danger);
  box-shadow: 0 0 0 4px var(--danger-soft);
  flex-shrink: 0;
}

.status-dot[data-on="true"] {
  background: var(--ok);
  box-shadow: 0 0 0 4px var(--ok-soft);
}

.connect-toggle-label {
  flex: 1;
}

.chevron {
  color: var(--muted);
  font-size: 0.7rem;
}

.connect-body {
  padding: 0 clamp(0.85rem, 2vw, 1.25rem) 0.95rem;
}

.connect-lede {
  max-width: 960px;
  margin: 0 0 0.75rem;
  padding: 0.75rem 0.9rem;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--warning) 9%, var(--panel));
  font-size: 0.8rem;
  color: var(--muted);
  line-height: 1.45;
}

.connect-lede code {
  font-size: 0.78em;
  padding: 0.06em 0.25em;
  border-radius: 4px;
  background: var(--panel);
  border: 1px solid var(--line);
}

.connect-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.7rem 0.9rem;
  max-width: 960px;
}

@media (max-width: 720px) {
  .connect-grid {
    grid-template-columns: 1fr;
  }
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.28rem;
}

.label {
  font-size: 0.68rem;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.input {
  width: 100%;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  padding: 0.55rem 0.7rem;
  background: var(--panel);
  color: var(--text);
  font-size: 0.86rem;
  transition:
    border-color 0.16s ease,
    box-shadow 0.16s ease,
    background 0.16s ease;
}

.input:focus {
  border-color: color-mix(in srgb, var(--accent) 52%, var(--line));
  box-shadow: 0 0 0 3px var(--focus-ring);
}

.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.45rem;
  margin-top: 0.5rem;
}

.btn {
  border-radius: var(--radius-md);
  border: 1px solid var(--line);
  padding: 0.5rem 0.95rem;
  font-size: 0.84rem;
  font-weight: 600;
  cursor: pointer;
  background: var(--panel);
  color: var(--text);
  transition:
    border-color 0.16s ease,
    background 0.16s ease,
    transform 0.16s ease;
}

.btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.btn.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-contrast);
}

.btn:not(:disabled):hover {
  transform: translateY(-1px);
}

.btn.ghost:hover {
  border-color: var(--line-strong);
  background: var(--panel-strong);
}

.msg {
  margin: 0.45rem 0 0;
  font-size: 0.82rem;
}

.err {
  color: var(--danger);
}

.ok {
  color: var(--ok);
}
</style>
