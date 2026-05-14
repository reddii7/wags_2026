<script setup>
import { provide, computed } from "vue";
import { RouterLink, RouterView, useRoute } from "vue-router";
import { useAdminSupabase } from "./composables/useAdminSupabase.js";
import { ENTITY_ADMIN_PAGES } from "./config/entityAdminConfig.js";

const admin = useAdminSupabase();
provide("adminCtx", admin);

const route = useRoute();

const currentTitle = computed(
  () => route.meta?.title || "WAGS Admin",
);

const adminNavItems = ENTITY_ADMIN_PAGES.map((p) => ({
  to: p.path,
  label: p.title,
}));

const navGroups = [
  {
    label: "Member PWA (preview)",
    items: [
      { to: "/app/stats", label: "Stats hub" },
      { to: "/app/home", label: "Home" },
      { to: "/app/results", label: "Results" },
      { to: "/app/leagues", label: "Leagues" },
      { to: "/app/best14", label: "Best 14" },
      { to: "/app/handicaps", label: "Handicaps" },
      { to: "/app/rscup", label: "RS Cup" },
    ],
  },
  {
    label: "Manage (database)",
    items: [
      { to: "/", label: "Overview" },
      { to: "/manage/season-close", label: "Close summer (P/R)" },
      ...adminNavItems,
    ],
  },
  {
    label: "Dev",
    items: [{ to: "/dev/rpc", label: "RPC console" }],
  },
  {
    label: "Notifications",
    items: [{ to: "/notifications", label: "Send notification" }],
  },
];

function navClass(to) {
  const path = route.path;
  if (to === "/") return path === "/" ? "active" : "";
  return path === to || path.startsWith(to + "/") ? "active" : "";
}
</script>

<template>
  <div class="shell">
    <header class="top">
      <div class="brand">
        <span class="logo">WAGS</span>
        <span class="sub">Admin</span>
      </div>
      <div class="status" :data-on="admin.connected.value">
        {{ admin.connected.value ? "Connected" : "Offline" }}
      </div>
    </header>

    <section class="connect">
      <p class="connect-lede">
        Use the <strong>service role</strong> key (Dashboard → Settings → API). Stored in
        <code>localStorage</code> after connect; optional <code>admin/.env</code>
        <code>VITE_SUPABASE_*</code>.
      </p>
      <div class="connect-grid">
        <label class="field">
          <span class="label">Project URL</span>
          <input
            v-model="admin.url.value"
            class="input"
            type="url"
            autocomplete="off"
            placeholder="https://….supabase.co"
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
      <p v-if="admin.connectError.value" class="err">{{ admin.connectError.value }}</p>
      <p v-else-if="admin.connected.value && admin.lastProbeOk.value" class="ok">
        Reachability OK (<code>campaigns</code> readable).
      </p>
    </section>

    <div class="body">
      <aside class="side" aria-label="Admin navigation">
        <div v-for="g in navGroups" :key="g.label" class="nav-block">
          <div class="nav-head">{{ g.label }}</div>
          <RouterLink
            v-for="item in g.items"
            :key="item.to"
            :to="item.to"
            class="nav-link"
            :class="navClass(item.to)"
          >
            {{ item.label }}
          </RouterLink>
        </div>
      </aside>
      <main class="main">
        <h2 class="page-title">{{ currentTitle }}</h2>
        <RouterView />
      </main>
    </div>
  </div>
</template>

<style scoped>
.shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--line);
  background: var(--surface);
}

.brand {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
}

.logo {
  font-weight: 800;
  letter-spacing: 0.04em;
}

.sub {
  color: var(--muted);
  font-size: 0.9rem;
}

.status {
  font-size: 0.8rem;
  font-weight: 600;
  padding: 0.25rem 0.6rem;
  border-radius: 999px;
  background: #3a2a2a;
  color: #fca5a5;
}

.status[data-on="true"] {
  background: #163b24;
  color: #86efac;
}

.connect {
  padding: 0.85rem 1rem;
  border-bottom: 1px solid var(--line);
  background: color-mix(in srgb, var(--surface) 88%, var(--bg));
}

.connect-lede {
  margin: 0 0 0.65rem;
  font-size: 0.8rem;
  color: var(--muted);
  line-height: 1.45;
}

.connect-lede code {
  font-size: 0.78em;
  padding: 0.06em 0.25em;
  border-radius: 4px;
  background: var(--bg);
  border: 1px solid var(--line);
}

.connect-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.65rem 1rem;
}

@media (max-width: 820px) {
  .connect-grid {
    grid-template-columns: 1fr;
  }
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.label {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.input {
  width: 100%;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 0.45rem 0.55rem;
  background: var(--bg);
  color: var(--text);
  font-size: 0.88rem;
}

.row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.btn {
  border-radius: 8px;
  border: 1px solid var(--line);
  padding: 0.45rem 0.9rem;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  background: var(--bg);
  color: var(--text);
}

.btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.btn.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

.btn.ghost:hover {
  border-color: var(--muted);
}

.err {
  margin: 0.5rem 0 0;
  color: #fecaca;
  font-size: 0.85rem;
}

.ok {
  margin: 0.5rem 0 0;
  color: #bbf7d0;
  font-size: 0.85rem;
}

.ok code {
  font-size: 0.85em;
}

.body {
  display: flex;
  flex: 1;
  min-height: 0;
}

.side {
  width: 220px;
  flex-shrink: 0;
  border-right: 1px solid var(--line);
  background: var(--surface);
  padding: 0.65rem 0;
  overflow-y: auto;
}

.nav-block {
  margin-bottom: 0.75rem;
}

.nav-head {
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
  padding: 0.35rem 0.85rem 0.25rem;
}

.nav-link {
  display: block;
  padding: 0.35rem 0.85rem;
  font-size: 0.82rem;
  color: var(--text);
  text-decoration: none;
  border-left: 3px solid transparent;
}

.nav-link:hover {
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}

.nav-link.active {
  border-left-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 8%, transparent);
  font-weight: 600;
}

.main {
  flex: 1;
  min-width: 0;
  padding: 1rem 1.25rem 2rem;
  overflow-x: auto;
}

.page-title {
  margin: 0 0 0.75rem;
  font-size: 1rem;
  font-weight: 600;
  color: var(--muted);
}
</style>
