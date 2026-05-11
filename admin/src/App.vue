<script setup>
import { ref, computed, onMounted } from "vue";
import { createClient } from "@supabase/supabase-js";

/** Same key as the legacy single-file admin (localStorage only). */
const STORAGE_KEY = "wags_admin_config";

const url = ref("");
const key = ref("");
const client = ref(null);
const connectError = ref("");
const connecting = ref(false);
const lastProbeOk = ref(false);

const rpcName = ref("admin_list_seasons");
const rpcParamsText = ref("{}");
const rpcBusy = ref(false);
const rpcError = ref("");
const rpcResult = ref("");

const connected = computed(() => !!client.value);

function loadSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const c = JSON.parse(raw);
    if (typeof c.url === "string") url.value = c.url;
    if (typeof c.key === "string") key.value = c.key;
  } catch {
    /* ignore */
  }
}

function persist() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ url: url.value.trim(), key: key.value.trim() }),
  );
}

onMounted(() => {
  loadSaved();
  const u = import.meta.env.VITE_SUPABASE_URL;
  const k = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
  if (u && !url.value) url.value = u;
  if (k && !key.value) key.value = k;
});

async function connect() {
  connectError.value = "";
  lastProbeOk.value = false;
  connecting.value = true;
  client.value = null;
  try {
    const sb = createClient(url.value.trim(), key.value.trim(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await sb.from("seasons").select("id").limit(1);
    if (error) throw error;
    client.value = sb;
    lastProbeOk.value = true;
    persist();
  } catch (e) {
    connectError.value = e?.message || String(e);
  } finally {
    connecting.value = false;
  }
}

function disconnect() {
  client.value = null;
  lastProbeOk.value = false;
  rpcResult.value = "";
  rpcError.value = "";
}

async function runRpc() {
  rpcError.value = "";
  rpcResult.value = "";
  if (!client.value) {
    rpcError.value = "Connect first.";
    return;
  }
  const name = rpcName.value.trim();
  if (!name) {
    rpcError.value = "Enter an RPC function name.";
    return;
  }
  let params = {};
  const raw = rpcParamsText.value.trim();
  if (raw) {
    try {
      params = JSON.parse(raw);
    } catch {
      rpcError.value = "Params must be valid JSON.";
      return;
    }
  }
  rpcBusy.value = true;
  try {
    const { data, error } = await client.value.rpc(name, params);
    if (error) throw error;
    rpcResult.value =
      data === undefined || data === null
        ? String(data)
        : JSON.stringify(data, null, 2);
  } catch (e) {
    rpcError.value = e?.message || String(e);
  } finally {
    rpcBusy.value = false;
  }
}
</script>

<template>
  <div class="shell">
    <header class="top">
      <div class="brand">
        <span class="logo">WAGS</span>
        <span class="sub">Admin</span>
      </div>
      <div class="status" :data-on="connected">
        {{ connected ? "Connected" : "Offline" }}
      </div>
    </header>

    <main class="main">
      <section class="panel">
        <h1 class="h1">Supabase</h1>
        <p class="lede">
          Service role key stays in this browser only (localStorage +
          optional <code class="code">admin/.env</code> for dev). Use a
          private window on shared machines.
        </p>

        <label class="field">
          <span class="label">Project URL</span>
          <input
            v-model="url"
            class="input"
            type="url"
            autocomplete="off"
            placeholder="https://xxxx.supabase.co"
          />
        </label>
        <label class="field">
          <span class="label">Service role key</span>
          <input
            v-model="key"
            class="input"
            type="password"
            autocomplete="off"
            placeholder="eyJ…"
          />
        </label>

        <div class="row">
          <button
            type="button"
            class="btn primary"
            :disabled="connecting || !url.trim() || !key.trim()"
            @click="connect"
          >
            {{ connecting ? "Connecting…" : "Connect" }}
          </button>
          <button
            v-if="connected"
            type="button"
            class="btn ghost"
            @click="disconnect"
          >
            Disconnect
          </button>
        </div>

        <p v-if="connectError" class="err">{{ connectError }}</p>
        <p v-else-if="connected && lastProbeOk" class="ok">
          Reachability check passed (<code class="code">seasons</code> read).
        </p>
      </section>

      <section v-if="connected" class="panel">
        <h2 class="h2">RPC console</h2>
        <p class="lede">
          Call Postgres RPCs directly while you rebuild screens. Params must
          be JSON (use <code class="code">{}</code> when empty).
        </p>
        <label class="field">
          <span class="label">Function</span>
          <input
            v-model="rpcName"
            class="input mono"
            type="text"
            spellcheck="false"
          />
        </label>
        <label class="field">
          <span class="label">Params (JSON)</span>
          <textarea
            v-model="rpcParamsText"
            class="textarea mono"
            rows="5"
            spellcheck="false"
          />
        </label>
        <button
          type="button"
          class="btn primary"
          :disabled="rpcBusy"
          @click="runRpc"
        >
          {{ rpcBusy ? "Running…" : "Run RPC" }}
        </button>
        <p v-if="rpcError" class="err">{{ rpcError }}</p>
        <pre v-if="rpcResult" class="pre">{{ rpcResult }}</pre>
      </section>

      <section class="panel muted">
        <h2 class="h2">Next</h2>
        <p class="lede">
          Add Vue views here under <code class="code">admin/src/</code> and
          wire them to the same client. Run from repo root:
          <code class="code">npm run admin:dev</code>
          (port 5174).
        </p>
      </section>
    </main>
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
  padding: 1rem 1.25rem;
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

.main {
  flex: 1;
  width: min(720px, 100%);
  margin: 0 auto;
  padding: 1.5rem 1.25rem 3rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.panel {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 1.25rem 1.35rem;
}

.panel.muted {
  opacity: 0.92;
}

.h1 {
  margin: 0 0 0.35rem;
  font-size: 1.25rem;
}

.h2 {
  margin: 0 0 0.35rem;
  font-size: 1.05rem;
}

.lede {
  margin: 0 0 1rem;
  color: var(--muted);
  font-size: 0.88rem;
  line-height: 1.45;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin-bottom: 0.85rem;
}

.label {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.input,
.textarea {
  width: 100%;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 0.55rem 0.65rem;
  background: var(--bg);
  color: var(--text);
  font-size: 0.92rem;
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
    monospace;
  font-size: 0.82rem;
}

.textarea {
  resize: vertical;
  min-height: 6rem;
}

.row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.25rem;
}

.btn {
  border-radius: 8px;
  border: 1px solid var(--line);
  padding: 0.5rem 1rem;
  font-size: 0.9rem;
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

.btn.primary:not(:disabled):hover {
  background: var(--accent-hover);
  border-color: var(--accent-hover);
}

.btn.ghost:hover {
  border-color: var(--muted);
}

.err {
  margin: 0.75rem 0 0;
  color: #fecaca;
  font-size: 0.88rem;
}

.ok {
  margin: 0.75rem 0 0;
  color: #bbf7d0;
  font-size: 0.88rem;
}

.pre {
  margin-top: 1rem;
  padding: 0.85rem;
  border-radius: 8px;
  background: var(--bg);
  border: 1px solid var(--line);
  overflow: auto;
  max-height: 420px;
  font-size: 0.78rem;
  line-height: 1.4;
}

.code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
    monospace;
  font-size: 0.85em;
  padding: 0.08em 0.28em;
  border-radius: 4px;
  background: var(--bg);
  border: 1px solid var(--line);
}
</style>
